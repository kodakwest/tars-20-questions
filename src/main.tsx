import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function formatError(value: unknown) {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function reportClientError(source: string, value: unknown) {
  const panel = document.getElementById("app-debug-log");
  if (!panel) return;

  panel.hidden = false;
  panel.textContent = `[${source}]\n${formatError(value)}`;
}

window.addEventListener("error", (event) => {
  reportClientError("window.error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  reportClientError("unhandledrejection", event.reason);
});

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportClientError("react.render", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen min-h-svh place-items-center bg-void p-5 text-center text-slate-100">
          <div>
            <h1 className="font-display text-3xl font-bold text-danger">TARS display fault</h1>
            <p className="mt-3 text-sm text-slate-300">Debug details are shown below.</p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

try {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Missing #root element");
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  reportClientError("startup", error);
}
