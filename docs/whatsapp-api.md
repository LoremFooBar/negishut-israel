# Whatsapp API

## Management Links

- [Meta Developer Apps](https://developers.facebook.com/apps)
- [Whatsapp Manager](https://business.facebook.com/wa/manage)

## Generate Permanent Access Token

1. In Whatsapp Manager, go to business settings: top left drop-down → click this icon ⚙️ next to business name.
2. Go to Users → System users, create a system user with `admin` role.
3. Click `Assign assets`.
4. Under `Apps`, select the app → assign `Develop app` permission → save.
5. Click `Generate new token` → select the app → select `Never` for token expiration.
6. Make sure the following permissions are selected:
   1. business_management
   2. whatsapp_business_messaging
   3. whatsapp_business_management
7. Generate the token and save it somewhere safe - IT CANNOT BE RETRIEVED AGAIN.

❗ If the access token is lost, it is HIGHLY RECOMMENDED to revoke all tokens before creating a new one. ❗
