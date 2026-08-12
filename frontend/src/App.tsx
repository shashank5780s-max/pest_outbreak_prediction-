import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Prediction from "./pages/Prediction";
import FieldMap from "./pages/FieldMap";
import Analytics from "./pages/Analytics";
import { LeafScanner } from "./pages/LeafScanner";
import "./App.css";

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prediction" element={<Prediction />} />
          <Route path="/field-map" element={<FieldMap />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/leaf-scanner" element={<LeafScanner />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
