"""Regression checks for spread processing and preservation, no generation."""
import unittest
import numpy as np
from PIL import Image, ImageDraw
from process_final_book_trails import prepare_spread

class TrailProcessingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.left=Image.new('RGB',(2048,2048),(140,110,60))
        cls.shadow=Image.new('RGBA',(2048,2048),(0,0,0,0))
        ImageDraw.Draw(cls.shadow).rectangle((200,1528,400,1600),fill=(0,0,0,40))
        clean=Image.new('RGBA',(2048,2048),(140,110,60,255))
        cls.right=Image.alpha_composite(clean,cls.shadow).convert('RGB')
        # An old COOL feather: color-based preservation must not retain it.
        ImageDraw.Draw(cls.right).rectangle((600,1730,615,1745),fill=(10,20,200))
        cls.native=Image.new('RGB',(2048,1024),(140,110,60))
        cls.result,cls.pre=prepare_spread(cls.left,cls.right,cls.shadow,cls.native)

    def test_upper_scene_is_exact_and_center_split_has_no_geometry_shift(self):
        got=np.asarray(self.result)
        expected=np.concatenate([np.asarray(self.left),np.asarray(self.right)],axis=1)
        self.assertTrue(np.array_equal(got[:1321],expected[:1321]))
        self.assertEqual(self.result.size,(4096,2048))
        self.assertLessEqual(int(np.abs(got[1650,2047].astype(int)-got[1650,2048].astype(int)).max()),2)

    def test_cool_old_clue_is_removed_and_shadow_is_applied_once(self):
        rgb=self.result.getpixel((2048+607,1738))
        self.assertLess(rgb[2],rgb[0], 'Old blue clue must not survive beneath new trail')
        expected=Image.alpha_composite(self.pre,self.shadow).convert('RGB')
        self.assertEqual(self.result.getpixel((2300,1550)),expected.getpixel((252,1550)))
        self.assertGreater(self.result.getpixel((2300,1550))[0],105, 'Shadow must not be darkened twice')

    def test_invalid_geometry_is_rejected(self):
        with self.assertRaises(ValueError):
            prepare_spread(self.left,self.right,self.shadow,Image.new('RGB',(1024,1024)))
        with self.assertRaises(ValueError):
            prepare_spread(Image.new('RGB',(500,500)),self.right,self.shadow,self.native)

if __name__=='__main__':unittest.main()
