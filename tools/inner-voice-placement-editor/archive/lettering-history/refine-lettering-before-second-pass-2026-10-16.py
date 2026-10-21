"""Prepare a local lettering pass. Preserve story words and saved figures."""
from pathlib import Path
import argparse, copy, datetime, json, sys
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

EDITOR=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(EDITOR))
from lettering_state import clean_lettering
INK='#392e29'; CREAM='#fff5de'; GOLD='#ffe09a'; RUST='#793c28'
PAGE=200*72/25.4
pdfmetrics.registerFont(TTFont('Hand',str(EDITOR/'assets/lettering-LoveYaLikeASister.ttf')))

def block(text,x,y,w,*,size=16,leading=21,color=INK,align='left',angle=0,edge=False):
    return dict(text=text,left=x*26.25,top=y*26.25,width=w*26.25,size=size,leading=leading,color=color,align=align,rotation=angle,edge=edge)

def designs():
    b=block
    def night(text,x,y,w,**kw):return b(text,x,y,w,**({'color':CREAM,'edge':True}|kw))
    return {
    1:[b('Finding Our\nInner Voice',18,36,64,size=32,leading=40,align='center')],
    3:[b('[Customer dedication message]',20,43,68,size=20,leading=26,align='center')],
    5:[b("This was Alexandra's favorite park\nin all of Grass Valley.",6.4,5.7,65),
       b('Swings squeaked. Sneakers thumped.\nKids laughed and called,',6.4,15.1,65),
       b('"Again, again!"',9,24.7,58,size=20,color=RUST,angle=-3),
       b('Alexandra ran in, ready to play.',6.6,33.5,66)],
    6:[b('Swings. Tunnels. Sand.\nA climbing wall like a mountain.',24.7,5.7,69),
       b('Alexandra looked left, then right.',24.9,15.3,69),
       b('"What should I try first?"',27,21,67,size=17),
       b('Then came a',24.9,29.2,32),
       b('whoosh',57,28,36,size=24,color=RUST,angle=-7),
       b('from way up high.',46,36,48)],
    7:[b('It was the tall slide.',7,6,63),
       b('Kids climbed up. Kids sat down.\nKids whooshed all the way\nto the bottom.',7,12,66),
       b('"Again, again!" they shouted.',9,25,67,size=19,color=RUST,angle=-2),
       b('Alexandra looked up.',7,32,65),
       b('The slide looked fun.\nIt also looked',7,38,58),
       b('very, very tall.',20,48,56,size=20,color=RUST,angle=-3)],
    8:[b('Alexandra climbed to the top.',7,6,78),
       b('The slide looked even longer\nfrom here.',7,12.5,77),
       b('"Your turn!"  "Go!"  "It\'s fun!"',9,23,82,size=18,color=RUST,angle=-2),
       b("Alexandra's tummy flipped.\nThe top felt small.\nThe slide felt big.",35,30.5,60),
       b('Alexandra did not know what to do.',35,44,60)],
    9:[night('That night,\nAlexandra sat quietly\non the bed.\nThe slide was far away.\nThe big feeling\nwas still there.',27,5.5,30,leading=20),
       night('"Your turn!"  "Go!"  "It\'s fun!"',7,74,86,size=17,color=GOLD),
       night('Alexandra took a deep breath. The room grew quiet.',7,79,86,leading=20),
       night('"That was scary," said a tiny voice.',7,84,86),
       night('Alexandra nodded. "Yes."',7,89,86),
       night('"Oh! You can hear me now."',10,93,83,color=GOLD)],
    10:[night('"Who said that?"\nasked Alexandra.',56,7,38),
        night('A light blinked\nbeside the bed.',56,19,38),
        night('Then another.\nThen another.',60,30,34,color=GOLD,size=17,leading=24),
        night('The lights made a path\nacross the floor.',51,56,43),
        night('"Let\'s look together,"\nsaid the tiny voice.',48,68,47,color=GOLD)],
    11:[night('Alexandra followed the lights.',7,6,82),
        night('The walls became trees.\nThe rug became moss.\nThe ceiling filled with stars.',7,13,75),
        night('"This way," said the voice.\n"Whenever you\'re ready."',10,25.5,73,size=17,color=GOLD)],
    12:[night('On the quiet path\nlay a clue:',29,9,50,edge=False),
        night('a feather.',34,23,43,size=19,color=GOLD,angle=-3,edge=False),
        night('Alexandra looked left.',27,40,61),
        night('Then right.',44,48,49),
        night('"Where are you?"',29,61,64,size=19,angle=3),
        night('called Alexandra.',34,69,59)],
    13:[night('Something rustled\nin a bush.',54,7,40),
        night('"Are you hiding?"',51,20,43,size=18,angle=-3),
        night('asked Alexandra.',55,27,40),
        night('The bush rustled\nagain. Then it sneezed.',58,35,37),
        night('"Achoo!"',72,55,24,size=24,color=GOLD,angle=12),
        night('Bushes do not usually sneeze.',10,87,80,align='center')],
    14:[night('Before Alexandra could peek,\nvoices called from every direction.',7,59,58),
        night('"This way!" blinked a star.\n"No, this way!" puffed the wind.',7,68,56),
        night('"Hop!" said a mushroom.\n"Skip!" said a stone.',10,77,51),
        night('A sign spun around.',7,86,47),
        night('"HURRY!"',32,91,35,size=21,color=GOLD,angle=-5)],
    15:[night('"Too many voices make it\nhard to hear your own,"\nsaid the tiny voice.',44,20,51),
        night('Alexandra stopped.',44,35,50),
        night('One slow breath.',48,41,46,size=18,color=GOLD),
        night('Alexandra listened for\nthe small, true voice inside.',44,49,51),
        night('"Listen close.\nI\'m still here."',44,60,51,color=GOLD),
        night('And there it was:\na quiet path.',48,69,47)],
    16:[night('The path split in two.',7,6,70),
        night('One way was smooth and shiny.\nIt looked easy.\nThe other was plain and steep.',7,13,72),
        night('Alexandra looked at the shiny path.\nIt was pretty.\nBut something inside felt tight.',7,27,76),
        night('A deep breath.',7,42,65),
        night('"Not that way,"',11,48,68,size=18,color=GOLD),
        night('whispered the tiny voice.',11,54,70)],
    17:[night('Alexandra chose the steep path.',7,6,75),
        night('Up, and up, and up.',9,23,70,size=19,color=GOLD,angle=-7),
        night('At the top, a cave glittered.\nAlexandra stepped closer.',7,36,70)],
    18:[night("Alexandra felt scared.\nAlexandra's tummy felt tight.",7,6,86),
        night('"YOU CAN\'T!"  "YOU\'RE TOO LITTLE!"',7,17,86,color=GOLD,size=17),
        night('The tiny voice echoed through the cave.',7,25,86),
        night('A wall blocked the path.\nThe same words glowed on it\nin big, prickly letters.',25,63,69),
        night("The tiny voice didn't sound friendly now.",25,76,69),
        b('"Why do you sound mean?"\nasked Alexandra.',30,88,65,size=17,leading=21,align='center')],
    19:[night('The voice was quiet.\nAlexandra remembered.',8,8,82),
        night('One deep breath.',8,20,43,size=18,color=GOLD,angle=-2),
        night('Then another.',15,28,40,size=17),
        night('The cave grew quieter.',8,37,45),
        night('The prickly words wiggled.',8,44,47),
        night('Then softened.',12,51,41,size=19,color=GOLD,angle=-2)],
    20:[night('The words opened.\nInside were smaller words:',7,6,82),
        night("I'M A LITTLE SCARED.  THIS FEELS TOO BIG.",7,17,82,color=GOLD),
        night('"Oh. You weren\'t trying to be mean."',24,72,70,size=17),
        night('The tiny voice felt warm again.',24,82,70)],
    21:[night('"Sometimes big feelings\ncome out sharp," said the voice.',9,12,80,size=17,leading=23),
        night('"But if you listen close,\nyou can hear what they\nare really trying to say."',14,31,75,size=18,leading=25,color=GOLD)],
    22:[night('The prickles fell away.\nThe wall shimmered.',8,9,63),
        night('The cave',8,27,47),
        night('opened wide.',13,35,59,size=21,color=GOLD,angle=-5),
        b('Beyond it,\nthe world was bright.',60,75,35),
        b('Alexandra stepped through.',48,88,47)],
    23:[b('Alexandra ran into the sunlight.',9,6,82,align='center',angle=-2),
        b('Alexandra felt a little better now.',9,13,82),
        b('Now Alexandra understood.\nThe tiny voice helped them notice',28,21,67),
        b('what felt scary,',29,31,65),
        b('what felt wrong,',35,35,60),
        b('and what felt right.',41,40.5,55,size=18,angle=0)],
    24:[night('"I want to see you,"\nsaid Alexandra.',8,14,64),
        b('A trail of feathers glowed ahead.\nThe forest grew warmer and quieter.',35,28,60),
        b('"Where are you?"',35,41,60,size=19,angle=-3),
        b('"Listen close," said the tiny voice.\n"That quiet is your heart."',30,52,65,size=17,leading=22)],
    25:[b('In a warm, magical clearing,\nOwl appeared.',23,6,68),
        night('Alexandra gasped.',12,16,70),
        b('"It was you?"',45,22,48,size=19,color=INK,angle=-3),
        b('Owl smiled.',23,27,67),
        b('"I am your quiet voice," said Owl,\n"in a shape you can see."',23,33,70),
        b('The warm quiet was inside\nAlexandra, too.',20,76,60,align='center')],
    26:[night('Alexandra and Owl flew\nthrough the stars.',30,14,64),
        night('The magical forest grew small below.\nAhead was the park, the ladder,\nand the very, very tall slide.',30,25,65),
        night('Owl stayed close.\nSo did the quiet voice.',60,40,35,color=GOLD)],
    27:[b('Alexandra was back at the top.',7,6,80),
        b('The slide still looked long.\nThe slide still looked fun.\nThe slide still looked very, very tall.',7,13,82),
        b('"Your turn!"  "Go!"  "It\'s fun!"',9,27,82,size=18,color=RUST,angle=-2),
        b("Alexandra's tummy flipped.",7,35,78),
        b('This time, Alexandra knew what to do.',7,42,84),
        b('Pause.',36,68,41,size=19),
        b('Breathe.',40,75,43,size=19),
        b('Listen close.',44,82,46,size=19)],
    28:[b('The quiet voice was there.\nSmall and warm.',7,6,80),
        b('"Not yet," it said.',7,16.5,65),
        b('"Almost."',33,22,57,size=20,color=RUST,angle=-3),
        b('Alexandra looked at the child\nwaiting behind them.',7,31,81),
        b('"You go first," said Alexandra.',7,39,81),
        b('"I\'m almost ready."',24,45,40),
        b('And this time,\nAlexandra smiled.',16,85,42)],
    30:[night('Pause. Breathe.\nListen close.',22,12,64,size=20,leading=27,align='center',color=GOLD),
        night('Trace the spiral with your finger.',18,29,73),
        night('Breathe in as you go around.\nBreathe out as you come back.',18,36,73),
        night("Think of something you'd like to try.",18,50,76),
        night('How does it make you feel?',18,57,76,size=18,color=GOLD),
        night('Listen close. Does your quiet voice say\n"no," "not yet," or "yes"?',29,67,65),
        night('You can take your time.',25,78,67,size=18,align='center',color=GOLD)],
    31:[b('About Little Hero Labs / copyright page.',8,10,84,size=14,leading=19),
        b('For grown-ups',8,25,84,size=19),
        b('Ask your child: "Was there a time today\nwhen you felt ready, or when you\nwanted to wait?"',8,34,84,size=16,leading=23),
        b('Give them time to answer.',8,53,84)]}

def prepare(source,out):
    data=json.loads(source.read_text())
    for n,blocks in designs().items():
        for i,b in enumerate(blocks):b['id']=f'text-{n:02}-{i+1:02}'
        data['pages'][n-1]['blocks']=blocks
    data['savedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    data=clean_lettering(data,json.loads((EDITOR/'lettering-data.json').read_text()))
    out.write_text(json.dumps(data,indent=2)+'\n')
    print('Prepared',len(data['pages']),'pages;',sum(len(p['blocks']) for p in data['pages']),'blocks')
    for p in data['pages']:
        for b in p['blocks']:
            for line in b['text'].split('\n'):
                w=pdfmetrics.stringWidth(line,'Hand',b['size'])/PAGE*2625
                if w>b['width']:print('WRAP',p['page'],b['id'],round(w/b['width'],2),repr(line))

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--source',type=Path,default=EDITOR/'lettering.json');a.add_argument('--out',type=Path,required=True);args=a.parse_args();prepare(args.source,args.out)
