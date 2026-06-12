-- Voeg blocked toe aan wallets voor dispute/refund-afhandeling
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
