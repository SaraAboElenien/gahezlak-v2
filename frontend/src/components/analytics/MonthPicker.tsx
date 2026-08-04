import { useLang } from "@/hooks/useLang";

// MonthSelector component
export function MonthSelector({
  selectedMonth,
  setSelectedMonth,
  label,
}: {
  selectedMonth: { month: number; year: number };
  setSelectedMonth: (m: { month: number; year: number }) => void;
  label: string;
}) {
  const { currentLang } = useLang();

  // Month options
  const months =
    currentLang === "ar"
      ? [
          "يناير",
          "فبراير",
          "مارس",
          "أبريل",
          "مايو",
          "يونيو",
          "يوليو",
          "أغسطس",
          "سبتمبر",
          "أكتوبر",
          "نوفمبر",
          "ديسمبر",
        ]
      : [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];

  return (
    <div className="flex  gap-4 items-center">
      <span className="text-sm text-gray-700 w-1/5">{label}</span>
      <div className="flex gap-2 w-4/5">
        <select
          className="select select-bordered bg-gray-100"
          value={selectedMonth.month}
          onChange={(e) =>
            setSelectedMonth({
              ...selectedMonth,
              month: parseInt(e.target.value),
            })
          }
        >
          {months.map((m, i) => (
            <option key={i} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        <select
          className="select select-bordered bg-gray-100"
          value={selectedMonth.year}
          onChange={(e) =>
            setSelectedMonth({
              ...selectedMonth,
              year: parseInt(e.target.value),
            })
          }
        >
          {[2023, 2024, 2025].map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
