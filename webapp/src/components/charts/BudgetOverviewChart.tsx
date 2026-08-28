"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type OverviewDatum = { label: string; value: number };

const formatLakh = (v: number) => `₹${(v / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;

// IndianOil brand colors (navy/orange, sampled from the real logo) plus amber
// for "in-progress" figures — same mapping used in BudgetHeadComparisonChart
// and the Home page KPI tiles, so the color of a number means the same thing
// everywhere in the app.
const COLOR_BY_LABEL: Record<string, string> = {
  "Actual Expenditure": "#312D73", // brand navy
  "Approved BE": "#EC6519", // brand orange
  "Proposed RBE": "#D97706", // amber — your own in-progress figure
  "Ongoing Expenditure": "#6B67A8", // muted navy
  "Proposed BE": "#F2984D", // muted orange
};
const FALLBACK_COLOR = "#312D73";

export function BudgetOverviewChart({ data }: { data: OverviewDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 24, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid stroke="#e7e5e4" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={formatLakh}
          tick={{ fill: "#78716c", fontSize: 11 }}
          axisLine={{ stroke: "#e7e5e4" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fill: "#57534e", fontSize: 12 }}
          axisLine={{ stroke: "#e7e5e4" }}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => formatLakh(Number(value))}
          contentStyle={{ borderRadius: 8, borderColor: "#e7e5e4", fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.label} fill={COLOR_BY_LABEL[d.label] ?? FALLBACK_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
