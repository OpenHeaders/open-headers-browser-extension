# Privacy Policy for Open Headers

**Effective Date: April 17, 2025**

## Introduction

Open Headers is committed to protecting your privacy and ensuring transparency about how our software operates. This Privacy Policy explains our data practices for the Open Headers browser extension and companion app.

## 1. Overview

Open Headers is an open source project consisting of:
- A Chrome browser extension for managing HTTP headers
- An optional companion desktop application for accessing local system resources

Both components are available on GitHub under open source licenses, allowing for complete code inspection and verification.

## 2. Information Collection and Use

### What We Collect

**We Do Not Collect:**
- Personal information
- Usage statistics
- Browsing history
- Header values or content
- Any data from your computer

**Local Storage Only:**
- Your header configurations are stored locally in your browser using Chrome's storage API
- Dynamic header sources accessed through the companion app remain on your local device
- No data is transmitted to our servers or third parties

### How Information is Used

All configuration data is used solely for the functioning of the extension and remains on your device. We have no access to this information.

## 3. Data Sharing and Transfer

We do not collect or share any user data with third parties, as we do not collect any data in the first place.

## 4. Local Communication

The browser extension and companion app communicate locally via WebSocket on port 59210. This connection:
- Is limited to localhost (127.0.0.1)
- Does not transmit data over the internet
- Requires explicit user action to enable
- Uses a simple JSON-based protocol for requesting and receiving header values

## 5. Permissions

The extension requires certain permissions to function:

- **storage**: To save your header configurations
- **alarms**: For scheduling header updates
- **scripting**: To initialize extension functionality
- **declarativeNetRequest**: To modify HTTP headers
- **host_permissions** (`<all_urls>`): To modify headers for your specified domains

These permissions are used solely for the extension's core header modification functionality and not for collecting information.

## 6. Security

We prioritize security through:
- Local-only data storage
- No external network connections beyond your specified domains
- Open source code that can be audited by anyone
- Regular security updates

## 7. Children's Privacy

Open Headers is a developer tool and not intended for use by children under 13 years of age.

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of any changes by updating the "Effective Date" at the top of this policy.

## 9. Open Source Commitment

Both the Open Headers extension and companion app are fully open source under the MIT License. The source code is available on GitHub at:
- https://github.com/OpenHeaders/open-headers-browser-extension
- https://github.com/OpenHeaders/open-headers-app

We encourage users to review the code to verify our privacy claims.

## 10. Contact Information

If you have questions about this Privacy Policy or the Open Headers project, please:
- Create an issue on our GitHub repositories
- Contact us through our GitHub profile

As an open source project, we welcome community feedback and contributions to improve both our code and our policies.

## 11. Consent

By using Open Headers, you consent to this Privacy Policy. As we do not collect any personal information, there is no data to manage or delete.

This Privacy Policy is provided to meet Chrome Web Store requirements and to be transparent about our commitment to privacy and data security.