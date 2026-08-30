export default function Proxy({
  fill = "#FBFBFB",
}: {
  fill?: string;
}) {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 14H24V20H8V14Z"
        stroke={fill}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14V10C12 8.34315 13.3431 7 15 7H17C18.6569 7 20 8.34315 20 10V14"
        stroke={fill}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 20V23C10 24.1046 10.8954 25 12 25H20C21.1046 25 22 24.1046 22 23V20"
        stroke={fill}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 14V20"
        stroke={fill}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
