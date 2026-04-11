const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const accentColorFromSeed = (
  seed: string,
  saturation = 78,
  lightness = 56,
  alpha = 1
): string => {
  const hue = hashString(seed) % 360;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
};
