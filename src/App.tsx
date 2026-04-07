import { BrowserRouter, Route, Routes } from "react-router-dom";
import MlbScores from "./pages/mlb-scores";
import { ThemeProvider } from "@/components/theme-provider";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MlbScores />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
