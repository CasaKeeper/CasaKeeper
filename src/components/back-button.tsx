import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type BackButtonProps = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export default function BackButton({ label, href, onClick }: BackButtonProps) {
  const content = <><ArrowLeft className="back-button-icon" size={16} aria-hidden="true" /><span className="back-button-label">{label}</span></>;
  if (href) return <Link className="back-button" href={href}>{content}</Link>;
  return <button type="button" className="back-button" onClick={onClick}>{content}</button>;
}
