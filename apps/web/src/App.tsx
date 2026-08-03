import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import BankPage from "./pages/bank/BankPage";
import InterviewPage from "./pages/InterviewPage";
import JudgePage from "./pages/JudgePage";
import ReportPage from "./pages/ReportPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="bank" element={<BankPage />} />
          <Route path="interview/:id" element={<InterviewPage />} />
          <Route path="judge/:id" element={<JudgePage />} />
          <Route path="report/:id" element={<ReportPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route
            path="*"
            element={<div className="py-20 text-center text-sm text-gray-400">页面不存在</div>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
