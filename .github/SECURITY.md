# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/SaraAboElenien/gahezlak-v2/security/advisories/new) on this repository, which keeps the report visible only to the maintainer until a fix is available.

Please include what you were able to do, the steps to reproduce it, and the impact as you understand it. A proof of concept helps but is not required.

You can expect an acknowledgement within a few days. There is no bug-bounty programme attached to this project.

## Scope

This repository is the application source. There is no production deployment handling real customer data at present, and the payment integration runs against Paymob's sandbox — so findings are assessed on the code rather than on a live system.

Out of scope: automated scanner output submitted without a working proof of concept, findings that require a compromised device or account, and issues in third-party services the application integrates with (report those to the service concerned).

## Supported versions

The `main` branch is the only supported version. Fixes land there and are not backported.
