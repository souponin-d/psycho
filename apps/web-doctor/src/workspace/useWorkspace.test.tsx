import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspace } from "./useWorkspace";
import { ApiError, type Repository } from "./repository";
import { demoActor, seedPatients } from "./seed";

function fixture() {
  const patient = seedPatients()[0]!;
  const repository: Repository = {
    mode: "demo",
    actor: demoActor,
    list: vi.fn(async () => [patient]),
    execute: vi.fn(),
    create: vi.fn(),
    logout: vi.fn(),
  };
  return { patient, repository };
}
describe("workspace persistence", () => {
  it("suspends requests during reauthentication until the same account is restored", async () => {
    const { patient, repository } = fixture();
    vi.mocked(repository.execute)
      .mockRejectedValueOnce(new ApiError("expired", 401))
      .mockResolvedValue(patient);
    const { result } = renderHook(() => useWorkspace(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(
        result.current.mutate(patient.id, {
          type: "message.send",
          text: "Текст",
        }),
      ).rejects.toThrow("expired");
    });
    expect(result.current.sessionExpired).toBe(true);
    const reads = vi.mocked(repository.list).mock.calls.length;
    await act(async () => {
      await result.current.refresh();
      await expect(
        result.current.mutate(patient.id, {
          type: "message.send",
          text: "Текст",
        }),
      ).rejects.toThrow("Сессия");
    });
    expect(repository.list).toHaveBeenCalledTimes(reads);
    expect(repository.execute).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.setSessionExpired(false);
      await result.current.refresh();
    });
    expect(repository.list).toHaveBeenCalledTimes(reads + 1);
  });
  it("reuses a command after the response is lost", async () => {
    const { patient, repository } = fixture();
    vi.mocked(repository.execute)
      .mockRejectedValueOnce(new ApiError("lost", 0))
      .mockResolvedValueOnce({ ...patient, revision: patient.revision + 1 });
    const { result } = renderHook(() => useWorkspace(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const mutation = { type: "message.send" as const, text: "Проверка" };
    await act(async () => {
      await expect(result.current.mutate(patient.id, mutation)).rejects.toThrow(
        "lost",
      );
    });
    await act(async () => {
      await result.current.mutate(patient.id, mutation);
    });
    const calls = vi.mocked(repository.execute).mock.calls;
    expect(calls[1]![1].commandId).toBe(calls[0]![1].commandId);
    expect(calls[1]![1].expectedRevision).toBe(calls[0]![1].expectedRevision);
  });
  it("reuses the patient identity after uncertain creation", async () => {
    const { patient, repository } = fixture();
    vi.mocked(repository.create)
      .mockRejectedValueOnce(new ApiError("lost", 0))
      .mockResolvedValueOnce(patient);
    const { result } = renderHook(() => useWorkspace(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.create({ name: "Пример" })).rejects.toThrow();
    });
    await act(async () => {
      await result.current.create({ name: "Пример" });
    });
    const calls = vi.mocked(repository.create).mock.calls;
    expect(calls[0]![1]).toBeTruthy();
    expect(calls[1]![1]).toBe(calls[0]![1]);
    expect(
      result.current.patients.filter((p) => p.id === patient.id),
    ).toHaveLength(1);
  });
  it("refreshes persisted patient updates when the window regains focus", async () => {
    const { patient, repository } = fixture();
    const { result } = renderHook(() => useWorkspace(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(repository.list).mockResolvedValue([
      { ...patient, revision: patient.revision + 2 },
    ]);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(result.current.patients[0]!.revision).toBe(patient.revision + 2),
    );
  });
});
