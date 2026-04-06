import { BrowserRouter, Route, Routes } from "react-router-dom";
import BlankDemo from "./pages/blank-demo";
import { ThemeProvider } from "@/components/theme-provider";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<BlankDemo />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
