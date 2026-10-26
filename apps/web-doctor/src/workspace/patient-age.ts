export function patientAgeAt(birthDate: string, reference: string): number {
  const day = reference.slice(0, 10);
  return (
    Number(day.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    (day.slice(5) < birthDate.slice(5) ? 1 : 0)
  );
}

export function patientBirthDateBounds(reference = new Date().toISOString()) {
  const date = new Date(reference);
  const shifted = (years: number) => {
    const year = date.getUTCFullYear() - years;
    const month = date.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(
      Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)),
    );
  };
  const earliest = shifted(121);
  earliest.setUTCDate(earliest.getUTCDate() + 1);
  return {
    min: earliest.toISOString().slice(0, 10),
    max: shifted(18).toISOString().slice(0, 10),
  };
}
