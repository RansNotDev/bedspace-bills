import React from 'react';

export default function QRCodeDisplay({ cycle }) {
  if (!cycle) return null;

  const { gcashNumbers, gcashQRImages } = cycle;

  const sections = [
    {
      key: 'electricity',
      label: '⚡ Electricity',
      number: gcashNumbers?.electricity,
      qr: gcashQRImages?.electricity,
    },
    {
      key: 'water',
      label: '💧 Water',
      number: gcashNumbers?.water,
      qr: gcashQRImages?.water,
    },
    {
      key: 'others',
      label: '🗑️ Others (Drinking Water + Trash)',
      number: gcashNumbers?.others,
      qr: gcashQRImages?.others,
    },
  ];

  const hasAny = sections.some((s) => s.number || s.qr);
  if (!hasAny) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        No GCash payment info available yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {sections.map((section) => (
        (section.number || section.qr) && (
          <div key={section.key} className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="font-semibold text-gray-800 text-sm mb-2">{section.label}</p>
            {section.qr && (
              <img
                src={section.qr}
                alt={`${section.label} GCash QR`}
                className="w-32 h-32 object-contain mx-auto mb-2 rounded-lg border border-green-300"
              />
            )}
            {section.number && (
              <p className="text-sm font-mono font-bold text-green-800 bg-green-100 rounded px-2 py-1">
                {section.number}
              </p>
            )}
          </div>
        )
      ))}
    </div>
  );
}
