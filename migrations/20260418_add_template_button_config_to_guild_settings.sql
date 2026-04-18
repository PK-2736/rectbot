ALTER TABLE guild_settings
ADD COLUMN IF NOT EXISTS template_button_config JSONB;

COMMENT ON COLUMN guild_settings.template_button_config IS 'Web customizer recruit button config: template mapping, button style/label, embed text, and default send channel';
