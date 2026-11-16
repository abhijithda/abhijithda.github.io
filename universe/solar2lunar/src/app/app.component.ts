import { Component } from '@angular/core';

export class LunarAge {
  yy: number;
  mm: number;
  dd: number;
  name: string;
}

@Component({
  selector: 'my-app',
  template: `
  <h1>{{title}}</h1>
  <div>
  <label>Name: </label>
  <input [(ngModel)]="lunarAge.name" placeholder="name">
  </div>
  <div>
  <label>Birth date as per solar calendar: </label>
  <input type="date" [(ngModel)]="birthdate"/>
  
  <div>
  <h2>{{lunarAge.name}}'s birth date!</h2>
  <h1>{{birthdate}}</h1>
  </div> 
  `,
})

export class AppComponent {
  title = 'Lunar Age';
  lunarAge: LunarAge = {
    yy: 2017,
    mm: 10,
    dd: 14,
    name: 'Guest'
  };
  // today: number = Date.now();
  birthdate: Date;  
}
