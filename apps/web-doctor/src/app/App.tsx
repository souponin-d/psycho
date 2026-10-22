import { lazy, Suspense } from "react";

const Workspace = lazy(() =>
  import("../workspace/DoctorWorkspace").then((module) => ({
    default: module.DoctorWorkspace,
  })),
);
const Legacy = lazy(() =>
  import("./LegacyDoctorApp").then((module) => ({
    default: module.LegacyDoctorApp,
  })),
);

export function App() {
  const examples =
    window.location.hash.startsWith("#/examples") ||
    window.location.hash.startsWith("#/legacy");
  return (
    <Suspense
      fallback={
        <div role="status" style={{ padding: 32 }}>
          Открываем рабочее место…
        </div>
      }
    >
      {examples ? <Legacy /> : <Workspace />}
    </Suspense>
  );
}
