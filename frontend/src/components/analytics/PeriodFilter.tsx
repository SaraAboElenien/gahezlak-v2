import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import { useLang } from "@/hooks/useLang";

function DateInput({
  label,
  date,
  onChange,
}: {
  label: string;
  date: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close picker if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="w-full  relative" ref={ref}>
      <label className="block mb-1 font-semibold">{label}</label>
      <button
        className="input input-bordered w-full text-left  shadow bg-muted "
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {date ? format(date, "yyyy-MM-dd") : "Select a date"}
      </button>

      {isOpen && (
        <div className="absolute z-20 bg-white p-2 shadow rounded mt-1">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(selected) => {
              onChange(selected);
              setIsOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function DatePicker({
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
}: {
  period?: "daily" | "monthly" | "yearly";
  setPeriod?: (v: "daily" | "monthly" | "yearly") => void;
  customStartDate: Date | undefined;
  setCustomStartDate: (d: Date | undefined) => void;
  customEndDate: Date | undefined;
  setCustomEndDate: (d: Date | undefined) => void;
}) {
  const { currentLang } = useLang();

  const fromLabel = currentLang === "ar" ? "من" : "From";
  const toLabel = currentLang === "ar" ? "إلى" : "To";
  return (
    <div className="grid grid-cols-2  gap-4 items-end w-full ">
      <DateInput
        label={fromLabel}
        date={customStartDate}
        onChange={setCustomStartDate}
      />
      <DateInput
        label={toLabel}
        date={customEndDate}
        onChange={setCustomEndDate}
      />
    </div>
  );
}

type Period = "daily" | "monthly" | "yearly";

export default function PeriodSelector({
  period,
  setPeriod,
}: {
  period: Period;
  setPeriod: (v: Period) => void;
}) {
  const { currentLang } = useLang();

  return (
    <div className="w-full ">
      <select
        className="select select-bordered w-full bg-transparent shadow cursor-pointer text-lg font-bold text-center"
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
      >
        <option value="daily">
          {" "}
          {currentLang === "ar" ? "يومي " : " Daily"}
        </option>
        <option value="monthly">
          {" "}
          {currentLang === "ar" ? "شهري  " : " Monthly"}{" "}
        </option>
        <option value="yearly">
          {" "}
          {currentLang === "ar" ? "سنوي " : " Yearly"}{" "}
        </option>
      </select>
    </div>
  );
}
