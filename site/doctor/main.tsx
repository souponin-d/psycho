import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@psycho/ui-web/styles.css";
import { DoctorWorkspace } from "../../apps/web-doctor/src/workspace/DoctorWorkspace";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DoctorWorkspace />
  </StrictMode>,
);
