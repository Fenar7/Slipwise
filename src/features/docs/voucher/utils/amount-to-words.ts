const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function convertUnderThousand(value: number): string {
  if (value < 20) {
    return SMALL_NUMBERS[value] ?? "";
  }

  if (value < 100) {
    const tensPart = TENS[Math.floor(value / 10)] ?? "";
    const remainder = value % 10;
    return remainder ? `${tensPart}-${SMALL_NUMBERS[remainder]}` : tensPart;
  }

  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const prefix = `${SMALL_NUMBERS[hundreds]} hundred`;
  return remainder ? `${prefix} ${convertUnderThousand(remainder)}` : prefix;
}

function convertWholeNumber(value: number): string {
  if (value === 0) {
    return "zero";
  }

  const scales: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];

  let remainder = value;
  const parts: string[] = [];

  for (const [scaleValue, scaleName] of scales) {
    if (remainder >= scaleValue) {
      const scaleAmount = Math.floor(remainder / scaleValue);
      parts.push(`${convertUnderThousand(scaleAmount)} ${scaleName}`);
      remainder %= scaleValue;
    }
  }

  if (remainder > 0) {
    parts.push(convertUnderThousand(remainder));
  }

  return parts.join(" ");
}

function capitalize(words: string) {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function amountToWords(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }

  const whole = Math.floor(value);
  const fraction = Math.round((value - whole) * 100);
  const wholeWords = convertWholeNumber(whole);

  if (fraction === 0) {
    return `Rupees ${wholeWords} only`;
  }

  const fractionWords = convertWholeNumber(fraction);
  return `Rupees ${wholeWords} and ${fractionWords} paise only`;
}
