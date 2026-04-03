export const SAMPLE_DATA = [
  {
    code: 'CB-420-PIR',
    name: '420kV Circuit Breaker with PIR',
    category: 'Circuit Breaker',
    sources: [
      { sourceName: 'APTRANSCO SSR 2025-26', sourceType: 'State Utility SSR', rate: 4190400, year: '2025-26', remarks: '' },
      { sourceName: 'TGTRANSCO SSR 2025-26', sourceType: 'State Utility SSR', rate: 4340000, year: '2025-26', remarks: '' },
      { sourceName: 'KPTCL SSR 2025-26', sourceType: 'State Utility SSR', rate: 4050000, year: '2025-26', remarks: '' },
      { sourceName: 'PGCIL PO 2024-25', sourceType: 'Purchase Order', rate: 4436590, year: '2024-25', remarks: 'PO for 10 nos' },
      { sourceName: 'GETCO PO 2024-25', sourceType: 'Purchase Order', rate: 4280000, year: '2024-25', remarks: '' },
      { sourceName: 'MSETCL PO 2024', sourceType: 'Purchase Order', rate: 4510000, year: '2024', remarks: '' },
      { sourceName: 'ABB Budgetary 2025', sourceType: 'OEM Budgetary Offer', rate: 4850000, year: '2025', remarks: '' },
      { sourceName: 'Siemens Budgetary 2025', sourceType: 'OEM Budgetary Offer', rate: 5100000, year: '2025', remarks: '' },
      { sourceName: 'IEEMA Formula', sourceType: 'Formula/Cost-Plus', rate: 4320000, year: '2025-26', remarks: 'Base price escalation' },
    ],
  },
  {
    code: 'CT-245',
    name: '245kV Current Transformer (Oil-filled)',
    category: 'Instrument Transformer',
    sources: [
      { sourceName: 'APTRANSCO SSR 2025-26', sourceType: 'State Utility SSR', rate: 594451, year: '2025-26', remarks: '' },
      { sourceName: 'TGTRANSCO SSR', sourceType: 'State Utility SSR', rate: 620000, year: '2025-26', remarks: '' },
      { sourceName: 'PGCIL PO', sourceType: 'Purchase Order', rate: 580000, year: '2024-25', remarks: '' },
      { sourceName: 'CGL Budgetary', sourceType: 'OEM Budgetary Offer', rate: 680000, year: '2025', remarks: '' },
    ],
  },
  {
    code: 'ISO-420-HCB',
    name: '420kV HCB Isolator with Earth Switch',
    category: 'Isolator',
    sources: [
      { sourceName: 'APTRANSCO SSR 2025-26', sourceType: 'State Utility SSR', rate: 886270, year: '2025-26', remarks: '' },
      { sourceName: 'TGTRANSCO SSR', sourceType: 'State Utility SSR', rate: 910000, year: '2025-26', remarks: '' },
      { sourceName: 'KPTCL SSR', sourceType: 'State Utility SSR', rate: 860000, year: '2024-25', remarks: '' },
      { sourceName: 'PGCIL PO', sourceType: 'Purchase Order', rate: 920000, year: '2024-25', remarks: '' },
      { sourceName: 'ABB Offer', sourceType: 'OEM Budgetary Offer', rate: 1050000, year: '2025', remarks: '' },
    ],
  },
];
