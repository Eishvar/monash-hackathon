/** The Shippr mark (public/shippr-logo.png: white ship on a transparent background, made for the dark UI). */
export function ShipprLogo({ className = "h-6 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/shippr-logo.png" alt="Shippr logo" className={className} />;
}
