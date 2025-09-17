// src/components/RightSummary.jsx
export default function RightSummary({ total }) {
    return (
        <div>
            <h3 className="font-bold text-lg mb-2">Итог заказа</h3>
            <div className="mb-4">[список выбранного]</div>
            <div className="text-right font-bold">Итого: {total} ₸</div>
        </div>
    );
}
