export type AccordionSection = "frequency" | "schedule" | "process" | "links" | "blockers" | "notes";

export function toggleAccordion(active: AccordionSection | null, next: AccordionSection): AccordionSection | null {
  return active === next ? null : next;
}
