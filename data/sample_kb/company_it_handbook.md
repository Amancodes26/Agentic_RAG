# Internal IT Support Handbook

## LLM Usage Policy

Employees must use Large Language Models (LLMs) responsibly and follow company security and data protection requirements when interacting with AI tools.

### API Keys and Secrets

- Employees must never enter API keys, access tokens, passwords, client secrets, private keys, or other credentials into prompts submitted to any LLM or AI tool.
- Employees must not share credentials with AI chatbots, AI agents, plugins, or third-party AI services, even when the tool appears trustworthy.
- API keys must be stored in environment variables or an approved secrets manager, never hardcoded into source code or included in prompts.
- If an API key or credential is accidentally exposed in a prompt, employees must immediately report the incident to IT Security and request credential rotation or revocation.

### Confidential and Sensitive Information

- Employees must not submit confidential company information, customer data, personal information, or internal documents to unapproved AI tools.
- Only company-approved AI platforms may be used to process internal business information.
- Employees must follow company data classification and handling policies when using AI tools.

### Safe AI Usage

- Employees must not use AI tools to bypass company security controls, access restrictions, or approval procedures.
- AI-generated code must be reviewed for security vulnerabilities before being used in production.
- Employees must verify AI-generated answers before relying on them for business-critical decisions.
- Employees must not upload source code, configuration files, logs, or documents containing secrets to public AI tools.

### Reporting Security Incidents

If credentials, confidential information, or other sensitive data are accidentally submitted to an AI tool, employees must promptly notify IT Security and follow incident-response instructions. Exposed credentials must be treated as potentially compromised.

### Compliance

Violations of this policy may result in access restrictions and disciplinary action in accordance with company policies.

## VPN Access

Employees working outside the office must use the company VPN before accessing internal systems.

1. Install the NovaSecure VPN client from the internal Software Portal.
2. Sign in using your company email and password.
3. Complete multi-factor authentication (MFA).
4. Select the closest corporate gateway.

**Troubleshooting:** If the connection fails, confirm internet connectivity, restart the VPN client, and try another corporate gateway.

Do not disable endpoint security or firewall settings to make the VPN work. If the issue persists, open an IT ticket and attach a screenshot of the error.

## Password Reset Policy

- Company passwords must be at least 14 characters long.
- Use the self-service identity portal for routine password resets.
- After five failed login attempts, an account may be temporarily locked.
- If self-service recovery fails, contact the IT Service Desk.
- Never share passwords or MFA codes with support personnel.

## Multi-Factor Authentication (MFA)

MFA is mandatory for email, VPN, cloud administration, and other protected company systems.

Approved authentication methods include:

- The company authenticator app.
- Registered hardware security keys.

SMS may only be used when explicitly enabled as a recovery method.

## Software Installation

Employees must install business software only from the company Software Portal.

Requests for software that is not listed in the portal require manager approval and an IT security review.

Administrator access is not granted solely to install unapproved applications.

## Lost or Stolen Laptop

Immediately report a lost or stolen company laptop to the IT Service Desk and your manager.

Provide the following information when available:

- Device asset tag.
- Last known location.

IT will initiate the appropriate device-lock or remote-wipe procedures and coordinate with Security.

Do not attempt to remotely recover the device yourself.
