import "@testing-library/jest-dom";
// Initialize the app's real i18next instance (bundled JSON resources, no
// network/HTTP backend) so components using useTranslation()/useLang() work
// in tests without needing an explicit <I18nextProvider> in every test.
import "@/libs/i18n";
