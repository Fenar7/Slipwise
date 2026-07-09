import { amountToWords } from "@/features/docs/voucher/utils/amount-to-words";

describe("amountToWords", () => {
  it("converts whole numbers", () => {
    expect(amountToWords(1850)).toBe("Rupees one thousand eight hundred fifty only");
  });

  it("converts decimals with paise", () => {
    expect(amountToWords(99.5)).toBe("Rupees ninety-nine and fifty paise only");
  });
});
