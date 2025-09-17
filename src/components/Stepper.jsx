// src/components/Stepper.jsx
export default function Stepper({ step }) {
    const steps = ["Коробка", "Выбор макаронсов", "Итог"];
    return (
        <div className="flex justify-center space-x-4 mb-4">
            {steps.map((label, i) => (
                <div
                    key={i}
                    className={`px-4 py-2 rounded-full ${
                        step === i ? "bg-blue-500 text-white" : "bg-gray-200"
                    }`}
                >
                    {label}
                </div>
            ))}
        </div>
    );
}
