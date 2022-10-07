import {Injectable} from '@angular/core';
import {Card} from "./Card";
import {SupabaseService} from "./supabase.service";
import {FileObject} from "@supabase/storage-js";

@Injectable({
  providedIn: 'root'
})
export class GameService {
  cards: Card[] | undefined
  numberOfCards: number = 52
  numberOfStack: number = 7
  suit: string[] = ['clubs', 'diamonds', 'spades', 'hearts']
  casing: string[] = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king']
  theme: string
  cardsBucketData: FileObject[] | undefined
  stacks: string[] = ['hiddenStore', 'shownStore', 'final-1', 'final-2', 'final-3', 'final-4']

  constructor(private readonly supabase: SupabaseService) {
    this.theme = 'default'
  }

  set cardsTheme(theme: string) {
    this.startGame(theme)
  }

  async startGame(theme: string) {
    try {
      this.createCards()
      if (!this.cards) return
      this.cards = this.shuffle(this.cards)
      this.sortCardsByStack()
      const cardsBucket = await this.supabase.cards
      const {data} = await cardsBucket.list(theme)
      if (!data) return
      this.cardsBucketData = data
      console.log(data)
      for (const card of this.cards) {
        card.srcCasing = await this.getCardSRC(card)
        card.srcBack = <string>(await this.supabase.downLoadImage("default/Card_back.svg")).publicURL
      }
    } catch ({message}) {
      console.error('Error getting cards from Cards Game object:  ', message)
    }
  }

  async getCardSRC(card: Card) {
    if (!this.cardsBucketData) return "default/Card_back.svg"
    const dataCard = this.cardsBucketData.find(item => item.name.includes(card.casing) && item.name.includes(card.suit))
    const src = dataCard ? `${this.theme}/${dataCard.name}` : "default/Card_back.svg"
    return <string>(await this.supabase.downLoadImage(src)).publicURL
  }

  createCards() {
    this.cards = []
    for (const s of this.suit) {
      for (const [index, c] of this.casing.entries()) {
        const color = s === 'diamonds' || s === 'hearts' ? "red" : "black"
        const card: Card = {
          suit: s,
          casing: c,
          id: `${c}_of_${s}`,
          height: 200,
          width: 138,
          priority: index,
          srcCasing: '',
          stack: '',
          shown: false,
          color,
          srcBack: ''
        }
        this.cards.push(card)
      }
    }
  }

  sortCardsByStack() {
    if (!this.cards) return
    const cardsDistribution = ([] as number[]).concat(...Array(this.numberOfStack).fill(null).map((item, index) => Array(index + 1).fill(null).map(() => index + 1)))
    for (const [index, card] of this.cards?.entries()) {
      if (index < cardsDistribution.length) {
        const num = cardsDistribution[index]
        const isLast = cardsDistribution[index + 1] !== num
        card.stack = `bottom-${num}`
        this.stacks.push(`bottom-${num}`)
        card.shown = isLast
      } else {
        card.stack = `hiddenStore`
      }
    }

  }

  shuffle(array: any[]) {
    let m = array.length, t, i
    while (m) {
      i = Math.floor(Math.random() * m--)
      t = array[m]
      array[m] = array[i]
      array[i] = t
    }
    return array
  }

  async getFromHiddenStore(card: Card) {
    if (!this.cards) return
    const index = this.cards.findIndex(c => c.id === card.id)
    if (!index) return
    this.cards.splice(index, 1)
    card.shown = true
    card.stack = 'shownStore'
    this.cards.push(card)
  }

  async refreshHiddenStore() {
    if (!this.cards) return
    const shownStore = this.cards.filter(c => c.stack === 'shownStore')
    for (let card of shownStore) {
      const index = this.cards.findIndex(c => c.id === card.id)
      if (index) {
        this.cards.splice(index, 1)
        card.stack = 'hiddenStore'
        card.shown = false
      }
    }
    this.cards = [...this.cards, ...shownStore.reverse()]
  }

  // @ts-ignore
  async changeStack(cards: Card[], newStack: string) {
    if (!this.cards) return
    const oldStack = cards[0].stack
    const priority = newStack.includes('final') ? -1 : 1
    const lastCard = this.cards.filter(c => c.stack === newStack).at(-1)
    //console.log(lastCard)
    if (lastCard) {
      if (priority === 1 && lastCard.color === cards[0].color) return console.error(`wrong color: ${priority}, ${lastCard.color}, ${cards[0].color}`)
      if (priority === -1 && lastCard.suit !== cards[0].suit) return console.error(`wrong suit in final stack: ${priority}, ${lastCard.suit}, ${cards[0].suit}`)
      if (lastCard.priority - cards[0].priority !== 1 * priority) return console.error(`wrong priority: ${priority}, ${lastCard.priority}, ${cards[0].priority}`)
    } else if ((cards[0].casing !== 'king' && priority === 1) || (cards[0].casing !== 'ace' && priority === -1)) {
      return console.error(`you can't put card on empty stack if it not king or ace (if priority===-1): ${priority}, ${cards[0].casing}`)
    }
    for (const card of cards) {
      //console.log(card)
      const cardIndex = this.cards.findIndex(c => c.id === card.id)
      this.cards?.splice(cardIndex, 1)
      card.stack = newStack
    }
    const previousStackNewLastCard = this.cards.filter(c => c.stack === oldStack).at(-1)
    if (previousStackNewLastCard) {
      const previousStackNewLastCardIndex = this.cards.findIndex(c => c.id === previousStackNewLastCard.id)
      this.cards.splice(previousStackNewLastCardIndex, 1)
      previousStackNewLastCard.shown = true
    }
    const newCards = <Card[]>[...cards, previousStackNewLastCard].filter(c => c).sort((a, b) => (priority * (b!.priority - a!.priority)))
    this.cards = [...this.cards, ...newCards]
  }
}
