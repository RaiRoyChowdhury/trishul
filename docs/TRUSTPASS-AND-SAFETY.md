# TrustPass, privacy and minor safeguards

## TrustPass (in-person QR)
1. The walk host accepts a request, then taps **Show my TrustPass QR** for that person.
2. The QR holds only `TP1.<id>.<random nonce>`: no name, no ID. Only the nonce's SHA-256 hash is stored. It **expires in 2 minutes** and works **once**.
3. Only the person whose request was accepted can scan it (camera scan, or type the code). A wrong person, expired or reused QR is refused.
4. After the scan **both** people must press confirm (within 10 minutes). Only then the state is *Verified in person*.
5. **Live location sharing is refused by the server** until a verified TrustPass exists for that walk, and only verified companions see each other. Location is deleted when the walk ends or sharing stops.
6. Each new QR cancels older unused ones for the same request.
Tested: `server/src/trustpass.test.ts` (nonce, expiry, replay, wrong person, window, states).

## Privacy settings
Adults choose: first name or only an initial, show/hide photo, show/hide age. Photo visibility is independent of ID verification.

## Minors
- No adult-minor matching: teens only see teen walks, adults only adult walks.
- Teens never show a photo, exact age, organisation or live location, and cannot use peer TrustPass.
- Minor companionship is only through verified Shakti volunteers with guardian consent (volunteer requests need guardian consent for teens) or fictional test accounts.

## ID verification (honest)
No DigiLocker or other provider is connected. The *Verify ID* action answers "not connected". Aadhaar numbers and ID images are never stored. Profiles show *Test account* / *Unverified* only.
