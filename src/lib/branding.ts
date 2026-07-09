export type BrandingConfig = {
  salutation?: string;
  companyName: string;
  address: string;
  email: string;
  phone: string;
  logoDataUrl?: string;
  accentColor: string;
  logoSize?: number;
  logoFit?: "contain" | "cover";
};
