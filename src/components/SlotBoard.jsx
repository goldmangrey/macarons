// src/components/SlotBoard.jsx
import { useRef } from "react";
import { useBuilderStore } from "../store/builderStore";

/**
 * Базовые inner-области (рабочее поле внутри коробки). 0..1 от размеров PNG.
 * Если у коробки в Firestore есть поле inner — оно имеет приоритет.
 */
const DEFAULT_INNERS = {
    "rect-6":  { x: 0.10, y: 0.12, w: 0.80, h: 0.62 }, // подняли поле выше и сделали ниже
    "round-8": { x: 0.10, y: 0.10, w: 0.80, h: 0.80 },
    "heart-12":{ x: 0.08, y: 0.14, w: 0.84, h: 0.72 },
};

/**
 * Жёсткая правка вертикали:
 * scaleY < 1 сжимает координаты по Y к верху. 0.66 ~= поднять «в 1.5 раза».
 * offsetY двигает дополнительно вверх/вниз.
 */
const ADJUST = {
    "rect-6":  { scaleY: 0.66, offsetY: -0.02 }, // <- ключевая настройка для твоего кейса
    "round-8": { scaleY: 0.90, offsetY:  0.00 },
    "heart-12":{ scaleY: 0.85, offsetY: -0.01 },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function SlotBoard({ macarons = [] }) {
    const containerRef = useRef(null);
    const { selectedBox, items, removeItem } = useBuilderStore();

    if (!selectedBox) return <p className="text-gray-500">Выберите коробку</p>;

    // 1) рабочая область
    const defKey = `${selectedBox.shape}-${selectedBox.capacity}`;
    const inner =
        selectedBox.inner ||
        DEFAULT_INNERS[defKey] ||
        { x: 0, y: 0, w: 1, h: 1 };

    // 2) настройка подъёма по вертикали
    const adj = ADJUST[defKey] || { scaleY: 1, offsetY: 0 };

    // 3) размер слота
// 3) размер слота (в процентах от ширины контейнера)
// порядок приоритета: из документа коробки -> карта по шаблону -> fallback
    const SIZE_BY_TEMPLATE = {
        "rect-6": 18,   // крупнее для 6
        "round-8": 16,  // чуть меньше для круга 8
        "heart-12": 13, // плотнее на сердце 12
        "rect-12": 14,  // если появится прямоугольная 12
        "round-12": 14, // если появится круг 12
    };
    const sizeKey = `${selectedBox.shape}-${selectedBox.capacity}`;
    const slotSizePct =
        Number(selectedBox.slotSize) ||
        (selectedBox.capacity <= 6 ? 18 :
            selectedBox.capacity <= 8 ? 16 :
                selectedBox.capacity <= 12 ? 14 : 12);



    return (
        <div
            ref={containerRef}
            className="relative w-full max-w-[700px] mx-auto"
            style={{ aspectRatio: "1/1" }}
        >
            {/* Фон коробки */}
            <img
                src={selectedBox.imageUrl}
                alt="box"
                className="w-full h-auto select-none pointer-events-none"
            />

            {/* Слоты */}
            {selectedBox.slotMap?.map((slot, index) => {
                const filled = items.find((it) => it.slot === index);
                const mac = filled ? macarons.find((m) => String(m.id) === String(filled.macaronId)) : null;

                // нормализованные координаты с учётом подъёма
                const xNorm = clamp01(slot.x);
                const yNorm = clamp01(slot.y);

                // перевод в проценты контейнера через inner-область
                const leftPct = (inner.x + xNorm * inner.w) * 100;
                const topPct  = (inner.y + yNorm * inner.h) * 100;

                return (
                    <div
                        key={index}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${slotSizePct}%`,
                            aspectRatio: "1 / 1",
                        }}
                    >
                        {/* Клик по занятым слотам = удалить сразу */}
                        <button
                            onClick={() => filled && removeItem(index)}
                            className="w-full h-full grid place-items-center rounded-full"
                            title={filled ? "Удалить" : ""}
                            style={{ cursor: filled ? "pointer" : "default" }}
                        >
                            {mac && mac.imageUrl ? (
                                <img
                                    src={mac.imageUrl}
                                    alt={mac.name}
                                    className="w-full h-full object-contain drop-shadow"
                                />
                            ) : (
                                <div className="w-full h-full rounded-full border-2 border-dashed border-gray-300/60" />
                            )}
                        </button>

                        {/* Кнопка «–» для удаления (дублирующий UX) */}
                        {filled && (
                            <button
                                onClick={() => removeItem(index)}
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white text-sm leading-6 text-center"
                                title="Убрать из слота"
                                style={{ zIndex: 5 }}
                            >
                                −
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
