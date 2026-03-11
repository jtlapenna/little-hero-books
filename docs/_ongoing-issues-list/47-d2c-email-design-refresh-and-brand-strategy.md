# 47 - D2C email design refresh and brand strategy

## Status
🟡 Open

## Summary

The D2C email system is now functionally improving, but the overall email experience still needs a stronger design concept, clearer brand strategy, and more intentional consistency across all customer-facing email types.

This issue is about the **design system and UX quality** of D2C emails, not just fixing individual rendering bugs. The goal is to make the full D2C email suite feel more polished, more on-brand, and more clearly connected to the Little Hero Labs customer experience.

## Why this is separate from issue 41

Issue 41 focused on:

- fixing broken/missing confirmation images
- supporting sibling-order confirmation layout
- validating whether other D2C email flows needed immediate sibling-specific changes

This new issue is broader:

- improve the visual design language
- define a better email content strategy
- create a more coherent system across confirmation, preview, reminder, print, and shipped emails

## Current problems

The current D2C emails work, but they still have several design and product weaknesses:

- the visual style is serviceable but not especially distinctive or memorable
- the current layouts are mostly utility-first rather than emotionally resonant
- the emails do not yet feel like a cohesive journey from purchase through delivery
- hierarchy, spacing, and content emphasis could be more intentional
- there is no clearly documented email design strategy for future additions
- different email types may read as variations of the same template rather than purpose-built moments in the customer journey

## Email flows in scope

Primary D2C email types currently in code:

- order confirmation
- preview ready / reminder emails
- print submitted
- shipped

Code references:

- `back-end/src/lib/notifications/d2c-email.ts`
- `back-end/src/lib/notifications/email-templates.ts`

## Desired outcome

Create a stronger D2C email system that:

- feels unmistakably Little Hero Labs
- has a clear visual and emotional strategy
- uses distinct but related layouts for different customer moments
- improves readability and perceived quality
- preserves email-client compatibility
- works for both single-item and sibling-order contexts where relevant

## Design goals

### Brand expression

The emails should feel:

- warm
- imaginative
- premium but approachable
- trustworthy for parents
- magical without becoming cluttered or overly decorative

### System consistency

The email family should share:

- a consistent visual language
- a recognizable header/footer system
- coherent typography and spacing
- reusable content patterns
- a documented tone and hierarchy model

### Moment-specific differentiation

Different email moments should feel intentionally different:

- confirmation should feel celebratory and reassuring
- preview-ready should feel exciting and action-oriented
- reminders should feel helpful, not nagging
- print-submitted should feel progress-oriented
- shipped should feel delightful and conclusive

## Work required

### 1. Audit the current D2C email system

- review all existing D2C email templates and sender flows
- identify where layouts are overly generic or repetitive
- identify where content hierarchy is weak
- identify places where the current design does not reflect the intended brand quality

### 2. Define an email design strategy

Create a documented strategy covering:

- visual tone
- content hierarchy
- typography approach
- color usage
- image usage rules
- CTA strategy
- how sibling-order cases should be presented

### 3. Redesign the email templates

Improve the actual email HTML system so that:

- major email types feel purpose-built
- layouts are better balanced and easier to scan
- emotional tone matches the stage in the customer journey
- image treatment is more intentional
- spacing and section structure are more refined

### 4. Document future guidelines

Produce a short reusable reference for:

- adding new D2C email types
- extending current templates
- maintaining visual consistency
- avoiding regressions into generic transactional-email styling

## Open questions

- Should all D2C email types share one flexible master template, or should there be 2-3 intentionally different layout families?
- How expressive should the emails become while staying compatible with common mail clients?
- Should sibling orders receive distinct content treatments in more email types beyond confirmation?
- Should the email system visually align more closely with the public storefront/site, or should it become its own stronger lifecycle-notification system?

## Acceptance criteria

- [ ] Current D2C email flows have a documented design strategy
- [ ] The email family feels more on-brand and intentionally designed
- [ ] The major customer moments are visually differentiated
- [ ] Single-item and sibling-order presentation rules are clearer
- [ ] A future maintainer can extend the email system without inventing the design approach from scratch
