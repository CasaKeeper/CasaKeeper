export type AccordionSection = "frequency" | "process" | "links" | "blockers" | "notes";

export function toggleAccordion(active: AccordionSection | null, next: AccordionSection): AccordionSection | null {
  return active === next ? null : next;
}
