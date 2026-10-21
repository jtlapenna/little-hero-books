"""Resolve the book renderer's personalization fields for a local proof."""
import re


def resolve_text(text, context):
    pronouns = {
        'she/her': ('she', 'her', 'her'),
        'he/him': ('he', 'him', 'his'),
        'they/them': ('they', 'them', 'their'),
    }[context.get('pronouns', 'they/them')]
    fields = {
        'child name': context.get('childName', 'Alexandra'),
        'subject pronoun': pronouns[0],
        'object pronoun': pronouns[1],
        'possessive pronoun': pronouns[2],
    }
    return re.sub(r'\[([^\]]+)\]', lambda m: fields.get(' '.join(m[1].lower().split()), m[0]), text)
