-- Remove the legacy whatsapp_provider config seed; messaging now runs on the Meta WhatsApp Cloud API (META_* env vars) and nothing reads this key.
DELETE FROM system_config WHERE key = 'whatsapp_provider';
