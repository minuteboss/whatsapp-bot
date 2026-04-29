
import sys
import os
from unittest.mock import MagicMock

# Add current directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.whatsapp_service import wa_service
from config import settings

def test_fallback():
    # Mock a tenant with no credentials
    tenant = MagicMock()
    tenant.whatsapp_token = None
    tenant.whatsapp_company_phone_number_id = None
    tenant.slug = "some-other-tenant"

    token = wa_service._get_token(tenant)
    phone_id = wa_service._get_company_phone_id(tenant)

    print(f"System Token: {settings.WHATSAPP_TOKEN[:10]}...")
    print(f"Resolved Token: {token[:10]}...")
    print(f"System Phone ID: {settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID}")
    print(f"Resolved Phone ID: {phone_id}")

    assert token == settings.WHATSAPP_TOKEN
    assert phone_id == settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID
    print("\nSUCCESS: Fallback logic working correctly!")

if __name__ == "__main__":
    test_fallback()
