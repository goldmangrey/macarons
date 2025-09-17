// src/App.jsx
import { useState } from "react";
import Builder from "./pages/Builder";
import Login from "./pages/Moderator/Login";
import Dashboard from "./pages/Moderator/Dashboard";

function App() {
    const [route, setRoute] = useState("builder");
    const [modOk, setModOk] = useState(false);

    return (
        <div className="min-h-screen">
            <div className="p-2 flex space-x-4 bg-gray-200">
                <button onClick={() => setRoute("builder")} className="px-3 py-1 bg-white rounded">Builder</button>
                <button onClick={() => setRoute("moderator")} className="px-3 py-1 bg-white rounded">Moderator</button>
            </div>

            {route === "builder" && <Builder />}
            {route === "moderator" && !modOk && <Login onLogin={() => setModOk(true)} />}
            {route === "moderator" && modOk && <Dashboard />}
        </div>
    );
}

export default App;
