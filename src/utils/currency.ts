export const formatMYR = (value: number | string) => {
  const amount = Number(value);
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
};