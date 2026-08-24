import { useState } from "react";

type Report = {
  _id: string;
  senderName: string;
  senderEmail: string;
  receiver: string;
  message: string;
  // String, not number: Report.phoneNumber is a phone number, and storing it
  // as a Number silently ate the leading zero of every Egyptian mobile until
  // 2026-08-24. See models/Report.ts and TECH_DEBT.md.
  phoneNumber?: string;
  shopName?: string;
  createdAt: string;
};

export default function ReportCard({ report }: { report: Report }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="card shadow-md bg-white dark:bg-base-200 border border-base-300">
        <div className="card-body">
          <h3 className="text-lg font-bold">{report.senderName}</h3>
          <p className="text-sm text-gray-500">{report.senderEmail}</p>
          <p className="line-clamp-2 mt-2">{report.message}</p>
          <div className="mt-3 flex justify-end">
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setModalOpen(true)}
            >
              View Details
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <dialog open className="modal modal-bottom sm:modal-middle">
          <form method="dialog" className="modal-box">
            <h3 className="font-bold text-lg">Report Details</h3>
            <div className="py-2">
              <p>
                <span className="font-semibold">Name:</span> {report.senderName}
              </p>
              <p>
                <span className="font-semibold">Email:</span>{" "}
                {report.senderEmail}
              </p>
              {report.phoneNumber && (
                <p>
                  <span className="font-semibold">Phone:</span>{" "}
                  {report.phoneNumber}
                </p>
              )}
              {report.shopName && (
                <p>
                  <span className="font-semibold">Shop:</span> {report.shopName}
                </p>
              )}
              <p>
                <span className="font-semibold">Message:</span>
              </p>
              <p className="whitespace-pre-line text-sm mt-1">
                {report.message}
              </p>
              <p className="text-xs text-gray-500 mt-4">
                {new Date(report.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="modal-action">
              <button className="btn" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
