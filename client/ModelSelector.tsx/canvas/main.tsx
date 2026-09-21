import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { exposeBuildInfo } from "./lib/build-info";

exposeBuildInfo();
createRoot(document.getElementById("root")!).render(<App />);
