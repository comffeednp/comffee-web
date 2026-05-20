import {
  AirVent,
  Armchair,
  Bed,
  Building2,
  Car,
  Coffee,
  Droplets,
  Flame,
  Gamepad2,
  Guitar,
  Headphones,
  Keyboard,
  Mic,
  Monitor,
  Moon,
  Mountain,
  Mouse,
  Music,
  Network,
  Piano,
  Plug,
  Printer,
  Router,
  Snowflake,
  Sparkles,
  Speaker,
  Thermometer,
  Trees,
  Tv,
  Utensils,
  Video,
  Waves,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  // existing
  monitor: Monitor,
  wifi: Wifi,
  coffee: Coffee,
  headphones: Headphones,
  utensils: Utensils,
  snowflake: Snowflake,
  gamepad: Gamepad2,
  video: Video,
  moon: Moon,
  bed: Bed,
  mountain: Mountain,
  flame: Flame,
  tree: Trees,
  sparkles: Sparkles,
  aircon: AirVent,
  mouse: Mouse,
  keyboard: Keyboard,
  tv: Tv,
  plug: Plug,
  parking: Car,
  printer: Printer,
  printing: Printer,
  sofa: Armchair,
  // updated
  shower: Droplets,   // was Waves; Waves is now pool
  // new
  pool: Waves,
  city: Building2,
  building: Building2,
  heater: Thermometer,
  router: Router,
  mikrotik: Router,
  network: Network,
  piano: Piano,
  guitar: Guitar,
  playstation: Gamepad2,
  ps: Gamepad2,
  mic: Mic,
  karaoke: Mic,
  speaker: Speaker,
  music: Music,
  fan: Wind,
};

export default function AmenityIcon({
  name,
  className = "h-5 w-5",
}: {
  name: string;
  className?: string;
}) {
  const Icon = map[name?.toLowerCase()] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
