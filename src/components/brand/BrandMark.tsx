type BrandMarkProps = {
  size?: number;
  title?: string;
};

export function BrandMark({ size = 42, title = "LLM Wiki" }: BrandMarkProps) {
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role="img"
      aria-label={title}
    >
      <rect x="72" y="72" width="880" height="880" rx="210" fill="#172A31" />
      <path d="M250 303C250 282 267 265 288 265H462C500 265 526 292 526 331V728C526 748 507 763 487 757C428 739 369 741 308 761C279 771 250 749 250 718Z" fill="#FFF3DA" />
      <path d="M526 331C526 292 552 265 590 265H764C785 265 802 282 802 303V718C802 749 773 771 744 761C683 741 624 739 565 757C545 763 526 748 526 728Z" fill="#E5D1A8" />
      <path d="M526 321V737" stroke="#B99C63" strokeWidth="16" strokeLinecap="round" />
      <path d="M308 396H452M308 474H438M590 396H736M610 474H736" stroke="#927B55" strokeWidth="20" strokeLinecap="round" opacity="0.62" />
      <path d="M393 442L509 528L634 414M509 528L649 615" fill="none" stroke="#C5A25F" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="393" cy="442" r="38" fill="#F2C879" stroke="#FFF3D2" strokeWidth="12" />
      <circle cx="509" cy="528" r="42" fill="#E8B85F" stroke="#FFF3D2" strokeWidth="12" />
      <circle cx="634" cy="414" r="38" fill="#78A98B" stroke="#E7F4EC" strokeWidth="12" />
      <circle cx="649" cy="615" r="35" fill="#A7B894" stroke="#F1F7EC" strokeWidth="12" />
    </svg>
  );
}
