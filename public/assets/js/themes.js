// Themed word lists for Word Search and Hangman. All plain everyday words.
export const THEMES = {
  Animals: 'badger beaver camel cheetah donkey eagle ferret giraffe hamster jaguar kangaroo koala leopard lizard monkey otter panda parrot penguin rabbit raccoon squirrel tiger turtle walrus zebra',
  Fruit: 'apple apricot banana blueberry cherry coconut cranberry grape guava kiwi lemon lime lychee mango melon orange papaya peach pear pineapple plum pomegranate raspberry strawberry watermelon',
  Vegetables: 'artichoke asparagus beetroot broccoli cabbage carrot cauliflower celery courgette cucumber eggplant garlic kale leek lettuce onion parsnip pepper potato pumpkin radish spinach squash sweetcorn turnip',
  Space: 'asteroid astronaut comet cosmos crater eclipse galaxy gravity jupiter lunar mars mercury meteor nebula neptune orbit planet pluto rocket satellite saturn solar star telescope universe',
  Sports: 'archery athletics badminton baseball basketball boxing cricket cycling diving fencing football golf gymnastics hockey judo karate netball rowing rugby sailing skiing surfing swimming tennis volleyball',
  Weather: 'blizzard breeze cloud cyclone drizzle drought flood fog frost gale hail hurricane lightning mist monsoon rain rainbow sleet snow storm sunshine thunder tornado typhoon wind',
  Kitchen: 'blender bowl colander cupboard fork freezer fridge grater kettle knife ladle microwave mixer oven pan plate saucepan sieve spatula spoon teapot toaster tray whisk wok',
  Music: 'banjo bass cello chord choir clarinet drum flute guitar harmony harp lyric melody note orchestra piano rhythm saxophone song tempo trumpet tuba ukulele violin xylophone',
  Ocean: 'anchor coral crab current dolphin harbour island jellyfish lighthouse lobster octopus oyster pearl reef sailor seagull seahorse seaweed shark shell starfish submarine tide whale wave',
  Jobs: 'actor architect artist baker builder butcher carpenter chef dentist doctor driver engineer farmer firefighter gardener journalist lawyer mechanic nurse pilot plumber scientist teacher vet writer',
  Garden: 'bench blossom bulb compost daisy fence flower hedge hose lawn mower orchid pansy path pond rake rose seed shed shovel soil sunflower trowel tulip weed',
  Colours: 'amber black blue bronze brown crimson cyan gold green grey indigo ivory lavender lilac magenta maroon navy olive orange pink purple scarlet silver turquoise violet',
  Body: 'ankle arm cheek chin elbow eyebrow finger foot forehead heart heel hip knee knuckle lung neck nose shoulder skeleton spine stomach thumb toe tongue wrist',
  Travel: 'airport backpack beach border cabin camera compass cruise ferry guide hostel hotel journey luggage map museum passport postcard ticket tourist train ticket visa voyage',
  Clothes: 'apron belt blazer blouse boots cardigan coat dress gloves hat hoodie jacket jeans jumper pyjamas sandals scarf shirt shorts skirt slippers socks sweater trainers waistcoat'
};
export const themeWords = (t) => [...new Set(THEMES[t].split(' '))];
