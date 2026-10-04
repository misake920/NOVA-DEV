import { useId } from "react";
import "./brand-mark.css";

/** The Ghost's angular hood and code brackets form a single, original mark. */
export default function BrandMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`ghost-brand-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-edge`}
          x1="14"
          y1="9"
          x2="50"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ff735b" />
          <stop offset=".38" stopColor="#ff173f" />
          <stop offset="1" stopColor="#d90031" />
        </linearGradient>
        <linearGradient
          id={`${id}-hood`}
          x1="31"
          y1="13"
          x2="32"
          y2="54"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#491018" />
          <stop offset="1" stopColor="#11080b" />
        </linearGradient>
        <radialGradient
          id={`${id}-glass`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(24 12) rotate(57) scale(53)"
        >
          <stop stopColor="#ff2547" stopOpacity=".17" />
          <stop offset="1" stopColor="#ff2547" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M14 3h36l11 11v36L50 61H14L3 50V14L14 3Z"
        fill="#10090c"
        stroke="#ff2744"
        strokeOpacity=".26"
      />
      <path
        d="M14 3h36l11 11v36L50 61H14L3 50V14L14 3Z"
        fill={`url(#${id}-glass)`}
      />
      <path
        d="m14 23-7 9 7 9M50 23l7 9-7 9"
        stroke={`url(#${id}-edge)`}
        strokeWidth="2.7"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="m32 12 13 10 2 30-8-5-7 7-7-7-8 5 2-30 13-10Z"
        fill={`url(#${id}-hood)`}
        stroke={`url(#${id}-edge)`}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="m23 28 7 2-2 6-5-2v-6Zm18 0-7 2 2 6 5-2v-6Z" fill="#ff304c" />
      <path d="m24 28 6 2M40 28l-6 2" stroke="#ffb5a1" strokeWidth="1.1" />
      <path
        d="m32 16 8 6M20 44v3M44 44v3"
        stroke="#ff725b"
        strokeOpacity=".6"
        strokeWidth="1"
      />
      <path
        d="M17 3H9M61 42v9l-7 7"
        stroke="#ff3e52"
        strokeOpacity=".52"
        strokeWidth="1"
      />
    </svg>
  );
}
