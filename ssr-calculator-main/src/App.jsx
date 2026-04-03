import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Header from './components/Layout/Header';
import UploadTab from './components/Upload/UploadTab';
import ManualTab from './components/Manual/ManualTab';
import MethodologyTab from './components/Methodology/MethodologyTab';

const TABS = [
  { id: 'upload', path: 'upload', label: 'Upload & Calculate' },
  { id: 'manual', path: 'manual', label: 'Manual Entry' },
  { id: 'methodology', path: 'methodology', label: 'Methodology' },
];

export default function App() {
  return (
    <BrowserRouter basename="/ssr-calculator">
      <div className="min-h-screen bg-gray-50">
        <Header />
        <nav className="bg-white border-b border-gray-200 px-6">
          <div className="max-w-7xl mx-auto flex gap-0">
            {TABS.map((tab) => (
              <NavLink
                key={tab.id}
                to={`/${tab.path}`}
                className={({ isActive }) =>
                  `px-4 py-2.5 text-sm transition-colors ${
                    isActive ? 'tab-active' : 'text-gray-400 hover:text-gray-600'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-5">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadTab />} />
            <Route path="/manual" element={<ManualTab />} />
            <Route path="/methodology" element={<MethodologyTab />} />
          </Routes>
        </main>
        <footer className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-gray-400 border-t border-gray-100 mt-8">
          This tool is for reference purposes only. Final SSR rates shall be determined by an informed decision of the committee.
        </footer>
      </div>
    </BrowserRouter>
  );
}
