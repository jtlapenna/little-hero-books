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

def inline(parts,x,y,*,color=INK,base=16,edge=False):
    blocks=[]
    gap=pdfmetrics.stringWidth(' ','Hand',base)/PAGE*100
    for part in parts:
        text,size,ink,angle=(part,base,color,0) if isinstance(part,str) else part
        width=pdfmetrics.stringWidth(text,'Hand',size)/PAGE*100
        top=y+(base-size)*.8/PAGE*100
        blocks.append(block(text,x,top,max(5,width+1),size=size,color=ink,angle=angle,edge=edge))
        x+=width+gap
    return blocks

def designs():
    b=block
    def night(text,x,y,w,**kw):return b(text,x,y,w,**({'color':CREAM,'edge':True}|kw))
    return {
    1:[b('Finding Our\nInner Voice',18,36,64,size=32,leading=40,align='center')],
    3:[b('[Customer dedication message]',20,43,68,size=20,leading=26,align='center')],
    5:[b("This was Alexandra's favorite park\nin all of Grass Valley.",6.4,5.7,65),
       *inline(['Swings',('squeaked.',24,RUST,-3)],6.4,16),
       *inline(['Sneakers',('thumped.',24,RUST,2)],6.4,23),
       b('Kids laughed and called,',6.4,30,65),
       b('"Again, again!"',9,36,58,size=25,color=RUST,angle=-3),
       b('Alexandra ran in, ready to play.',6.6,44,66)],
    6:[b('Swings. Tunnels. Sand.\nA climbing wall like a mountain.',24.7,5.7,69),
       b('Alexandra looked left, then right.',24.9,18,69),
       b('"What should I try first?"',27,25,67,size=17),
       *inline(['Then came a',('whoosh',32,RUST,-4),'from way up high.'],24.9,33.8)],
    7:[b('It was the tall slide.',7,6,63),
       b('Kids climbed up.',7,12,66),
       b('Kids sat down.',7,17,66),
       *inline(['Kids',('whooshed',24,RUST,-3),'all the way'],7,23.5),
       b('to the bottom.',7,28.5,66),
       *inline([('"Again, again!"',24,RUST,-2),'they shouted.'],8,34.5),
       b('Alexandra looked up.',7,40,65),
       b('The slide looked fun.',7,45,65),
       *inline(['It also looked',('very, very tall.',22,'#4c3024',0)],7,50.4)],
    8:[b('Alexandra climbed to the top.',7,6,78),
       b('The slide looked even longer\nfrom here.',7,12.5,77),
       b('"Your turn!"  "Go!"  "It\'s fun!"',9,23,82,size=18,color=RUST,angle=-2),
       b("Alexandra's tummy flipped.",52,32,43),
       b('The top felt small.',57,40,38),
       b('The slide felt big.',57,47,38),
       b('Alexandra did not\nknow what to do.',57,54,38)],
    9:[night('That night,\nAlexandra sat quietly\non the bed.',27,5.5,30,leading=21),
       night('The slide was far away.',27,19.5,30),
       night('The big feeling\nwas still there.',66,43,29),
       night('"Your turn!"\n"Go!" "It\'s fun!"',66,56,29,size=17,color=GOLD,leading=25),
       night('Alexandra took a deep breath.',7,72,86),
       night('The room grew quiet.',7,78,86),
       night('"That was scary," said a tiny voice.',7,84,86),
       night('Alexandra nodded. "Yes."',7,89,86),
       night('"Oh! You can hear me now."',10,94,83,color=GOLD)],
    10:[night('"Who said that?"\nasked Alexandra.',56,7,38),
        night('A light blinked\nbeside the bed.',56,19,38),
        night('Then another.',58,31,36,color=GOLD,size=21,angle=-2),
        night('Then another.',54,40,40,color=GOLD,size=21,angle=2),
        night('The lights made a path\nacross the floor.',51,56,43),
        night('"Let\'s look together,"\nsaid the tiny voice.',48,68,47,color=GOLD)],
    11:[night('Alexandra followed the lights.',7,6,82),
        night('The walls became trees.',7,14,75),
        night('The rug became moss.',7,20,75),
        night('The ceiling filled with stars.',7,26,75),
        night('"This way,"\nsaid the voice.\n"Whenever you\'re ready."',54,34,40,size=17,color=GOLD,leading=26)],
    12:[night('On the quiet path\nlay a clue:',29,9,50,edge=False),
        night('a feather.',34,23,43,size=22,color=GOLD,angle=-3,edge=False),
        *inline(['Alexandra looked',('left.',20,GOLD,-3)],24,40,color=CREAM,edge=True),
        night('Then right.',51,49,42,size=20,color=GOLD,angle=3),
        night('"Where are you?"',29,61,64,size=19,angle=3),
        night('called Alexandra.',34,69,59)],
    13:[night('Something rustled\nin a bush.',54,7,40),
        night('"Are you hiding?"',51,20,43,size=18,angle=-3),
        night('asked Alexandra.',55,27,40),
        night('The bush rustled again.',54,33,41),
        night('Then it sneezed.',66,39,29),
        night('"Achoo!"',70,55,27,size=31,color=GOLD,angle=8),
        night('Bushes do not usually sneeze.',10,87,80,align='center')],
    14:[night('Before Alexandra could peek,\nvoices called from every direction.',7,59,58),
        night('"This way!" blinked a star.\n"No, this way!" puffed the wind.',7,68,56,leading=26),
        *inline([('"Hop!"',21,GOLD,-3),'said a mushroom.'],10,78,color=CREAM,edge=True),
        *inline([('"Skip!"',21,GOLD,3),'said a stone.'],14,84.5,color=CREAM,edge=True),
        night('A sign spun around.',7,91,47),
        night('"HURRY!"',39,91,34,size=26,color=GOLD,angle=-6)],
    15:[night('"Too many voices make it\nhard to hear your own,"',44,16,51),
        night('said the tiny voice.',60,26,35),
        night('Alexandra stopped.',44,35,50),
        night('One slow breath.',47,41,47,size=22,color=GOLD,angle=-2),
        night('Alexandra listened for\nthe small, true voice inside.',44,49,51),
        night('"Listen close.\nI\'m still here."',44,60,51,color=GOLD),
        night('And there it was:\na quiet path.',48,69,47)],
    16:[night('The path split in two.',7,6,70),
        night('One way was smooth and shiny.\nIt looked easy.',7,14,72,leading=26),
        night('The other was plain and steep.',7,26,76),
        night('Alexandra looked at the shiny path.\nIt was pretty.',7,34,76,leading=26),
        night('But something inside felt tight.',7,46,76),
        night('A deep breath.',7,54,65),
        night('"Not that way,"',11,62,68,size=18,color=GOLD),
        night('whispered the tiny voice.',11,68,70)],
    17:[night('Alexandra chose the steep path.',7,6,75),
        night('Up, and up,',9,28,31,size=22,color=GOLD,angle=-5),
        night('and up.',36,21,31,size=28,color=GOLD,angle=-5),
        night('At the top, a cave glittered.',7,41.5,70),
        night('Alexandra stepped closer.',7,49,70)],
    18:[night("Alexandra felt scared.\nAlexandra's tummy felt tight.",7,5,86,leading=28),
        night('"YOU CAN\'T!"  "YOU\'RE TOO LITTLE!"',7,17,86,color=GOLD,size=17),
        night('The tiny voice echoed through the cave.',7,25,86),
        night('A wall blocked the path.',25,60,69),
        night('The same words glowed on it\nin big, prickly letters.',25,66,69),
        night("The tiny voice didn't sound friendly now.",25,75,69),
        b('"Why do you sound mean?"\nasked Alexandra.',40,88,54,size=17,align='left')],
    19:[night('The voice was quiet.\nAlexandra remembered.',8,7,82,leading=28),
        night('One deep breath.',8,20,43,size=18,color=GOLD,angle=-2),
        night('Then another.',15,28,40,size=17),
        night('The cave grew quieter.',8,37,45),
        *inline(['The prickly words',('wiggled.',20,GOLD,3)],8,44,color=CREAM,edge=True),
        night('Then softened.',24,52,32,size=21,color=GOLD,angle=-2)],
    20:[night('The words opened.\nInside were smaller words:',7,5,82,leading=28),
        night("I'M A LITTLE SCARED.  THIS FEELS TOO BIG.",7,17,82,color=GOLD),
        night('"Oh. You weren\'t trying to be mean."',24,72,70,size=17),
        night('The tiny voice felt warm again.',24,82,70)],
    21:[night('"Sometimes big feelings\ncome out sharp," said the voice.',9,12,80,size=17,leading=23),
        night('"But if you listen close,\nyou can hear what they\nare really trying to say."',14,31,75,size=18,leading=25,color=GOLD)],
    22:[night('The prickles fell away.\nThe wall shimmered.',8,8,63,leading=28),
        night('The cave',8,27,47),
        night('opened wide.',13,35,76,size=29,color=GOLD,angle=-5),
        b('Beyond it,\nthe world was bright.',60,75,35),
        b('Alexandra stepped through.',48,88,47)],
    23:[b('Alexandra ran into the sunlight.',9,6,82,align='center',angle=-2),
        b('Alexandra felt a little better now.',9,13,82),
        b('Now Alexandra understood.',28,21,67),
        b('The tiny voice helped them notice',28,27,67),
        b('what felt scary,',29,32,65),
        b('what felt wrong,',35,37,60),
        b('and what felt right.',41,42,55,size=18,angle=0)],
    24:[night('"I want to see you,"\nsaid Alexandra.',8,14,64),
        b('A trail of feathers glowed ahead.',35,28,60),
        b('The forest grew warmer and quieter.',35,35,60),
        b('"Where are you?"',35,44,60,size=19,angle=-3),
        b('"Listen close," said the tiny voice.\n"That quiet is your heart."',35,56,60,size=17,leading=28)],
    25:[b('In a warm, magical clearing,\nOwl appeared.',23,6,68),
        b('Alexandra gasped.',12,16,70,color='#211d19'),
        b('"It was you?"',45,21.5,48,size=24,color=INK,angle=-3),
        b('Owl smiled.',23,28,67),
        b('"I am your quiet voice," said Owl,\n"in a shape you can see."',23,33,70,leading=25),
        b('The warm quiet was inside\nAlexandra, too.',20,76,60,align='center')],
    26:[*inline(['Alexandra and Owl',('flew',24,GOLD,-4)],30,14,color=CREAM,edge=True),
        night('through the stars.',30,18.6,64),
        night('The magical forest grew small below.',30,25,65),
        night('Ahead was the park, the ladder,\nand the very, very tall slide.',30,30,65),
        night('Owl stayed close.\nSo did the quiet voice.',60,40,35,color=GOLD,leading=27)],
    27:[b('Alexandra was back at the top.',7,6,80),
        b('The slide still looked long.',7,14,82),
        b('The slide still looked fun.',7,20,82),
        *inline(['The slide still looked',('very, very tall.',22,RUST,-2)],7,26),
        b('"Your turn!"  "Go!"  "It\'s fun!"',9,34,82,size=22,color=RUST,angle=-2),
        b("Alexandra's tummy flipped.",7,42,78),
        b('This time, Alexandra\nknew what to do.',58,45,37),
        b('Pause.',36,68,41,size=19),
        b('Breathe.',40,75,43,size=19),
        b('Listen close.',44,82,46,size=19)],
    28:[b('The quiet voice was there.\nSmall and warm.',7,5,80,leading=28),
        b('"Not yet," it said.',7,16.5,65),
        b('"Almost."',33,22,57,size=24,color=RUST,angle=-3),
        b('Alexandra looked at the child\nwaiting behind them.',7,31,81),
        b('"You go first," said Alexandra.',7,41,81),
        b('"I\'m almost ready."',17,48,43),
        b('And this time,\nAlexandra smiled.',16,85,42)],
    30:[night('Pause. Breathe.\nListen close.',22,12,64,size=20,leading=27,align='center',color=GOLD),
        night('Trace the spiral with your finger.',18,29,73),
        night('Breathe in as you go around.\nBreathe out as you come back.',18,36,73,leading=28),
        night("Think of something you'd like to try.",18,50,76),
        night('How does it make you feel?',18,57,76,size=18,color=GOLD),
        night('Listen close. Does your quiet voice say\n"no," "not yet," or "yes"?',29,67,65),
        night('You can take your time.',20,78,60,size=18,align='center',color=GOLD)],
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
