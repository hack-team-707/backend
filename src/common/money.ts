const MONEY_SCALE = 4;
const MONEY_FACTOR = 10n ** BigInt(MONEY_SCALE);
const BASIS_POINTS_TOTAL = 10_000;
const MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,4}))?$/;

export type Money = bigint;

function assertBasisPoints(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINTS_TOTAL) {
    throw new RangeError('Basis points must be an integer between 0 and 10000');
  }
}

function assertNonNegative(value: Money): void {
  if (value < 0n) throw new RangeError('Money amount cannot be negative');
}

export function parseMoney(value: string): Money {
  const match = MONEY_PATTERN.exec(value);
  if (!match) throw new TypeError('Invalid non-negative money amount');
  const fraction = (match[2] ?? '').padEnd(MONEY_SCALE, '0');
  return BigInt(match[1]) * MONEY_FACTOR + BigInt(fraction || '0');
}

export function formatMoney(value: Money): string {
  assertNonNegative(value);
  const whole = value / MONEY_FACTOR;
  const fraction = (value % MONEY_FACTOR).toString().padStart(MONEY_SCALE, '0');
  return `${whole}.${fraction}`;
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  assertNonNegative(left);
  assertNonNegative(right);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function addMoney(left: Money, right: Money): Money {
  assertNonNegative(left);
  assertNonNegative(right);
  return left + right;
}

export function subtractMoney(left: Money, right: Money): Money {
  assertNonNegative(left);
  assertNonNegative(right);
  if (right > left)
    throw new RangeError('Money subtraction cannot be negative');
  return left - right;
}

export function multiplyByBasisPoints(
  amount: Money,
  basisPoints: number,
): Money {
  assertNonNegative(amount);
  assertBasisPoints(basisPoints);
  return (amount * BigInt(basisPoints)) / BigInt(BASIS_POINTS_TOTAL);
}

export function allocateByBasisPoints(
  amount: Money,
  basisPoints: readonly number[],
): Money[] {
  assertNonNegative(amount);
  basisPoints.forEach(assertBasisPoints);
  if (
    basisPoints.reduce((total, value) => total + value, 0) !==
    BASIS_POINTS_TOTAL
  ) {
    throw new RangeError('Allocation basis points must sum to 10000');
  }
  const allocations = basisPoints.map((value) =>
    multiplyByBasisPoints(amount, value),
  );
  let allocated = allocations.reduce(addMoney, 0n);
  for (let index = 0; allocated < amount; index += 1) {
    allocations[index % allocations.length] += 1n;
    allocated += 1n;
  }
  return allocations;
}
