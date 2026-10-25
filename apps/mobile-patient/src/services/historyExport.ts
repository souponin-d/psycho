import { Directory, File, Paths } from "expo-file-system";
import { printToFileAsync } from "expo-print";
import * as Sharing from "expo-sharing";
import {
  exportPatientHistory,
  historyHtml,
  type PatientHistoryProjection,
} from "../core/history";

export async function saveHistoryExport(
  data: PatientHistoryProjection,
  format: "json" | "pdf",
) {
  const name = `syncli-history-${data.range.from}-${data.range.to}-${Date.now()}.${format}`;
  const file = new File(Paths.document, name);
  if (format === "json") {
    file.create({ overwrite: false });
    file.write(JSON.stringify(exportPatientHistory(data), null, 2));
  } else {
    const printed = await printToFileAsync({
      html: historyHtml(data),
      width: 595,
      height: 842,
    });
    const temporary = new File(printed.uri);
    temporary.copy(file);
    temporary.delete();
  }
  return { uri: file.uri, name, format };
}
export async function openExportShareSheet(file: {
  uri: string;
  format: "json" | "pdf";
}) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Системное меню сохранения недоступно на этом устройстве");
  await Sharing.shareAsync(file.uri, {
    mimeType: file.format === "pdf" ? "application/pdf" : "application/json",
    dialogTitle: "Сохранить файл истории",
    UTI: file.format === "pdf" ? "com.adobe.pdf" : "public.json",
  });
}
export function clearSavedHistoryExports() {
  for (const entry of Paths.document.list())
    if (
      entry instanceof File &&
      /^syncli-history-.*\.(json|pdf)$/.test(entry.name)
    )
      entry.delete();
}
export async function saveExportCopy(file: {
  uri: string;
  name: string;
  format: "json" | "pdf";
}) {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (error instanceof Error && /cancel|отмен/i.test(error.message))
      return false;
    throw error;
  }
  const destination = directory.createFile(
    file.name,
    file.format === "pdf" ? "application/pdf" : "application/json",
  );
  destination.write(await new File(file.uri).bytes());
  return true;
}
