import AppLayout from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppStore } from "./store";

function App() {
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  return (
    <ErrorBoundary
      onError={(error) =>
        setStatusMessage(`UI error: ${error.message}`)
      }
    >
      <AppLayout />
    </ErrorBoundary>
  );
}

export default App;
