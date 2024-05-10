/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/

export const namehashValidData: [string, string][] = [
	['', '0x0000000000000000000000000000000000000000000000000000000000000000'],
	['zond', '0x7323bd9bffe34774c518704375fd259ef79e92b80a3bba9dc0d1fc4f1cc954f8'],
	['foo.zond', '0xd824a9cc5be35120faeba837729c78f54d55c6cada77dbbf24941ed283455882'],
	['FOO.zond', '0xd824a9cc5be35120faeba837729c78f54d55c6cada77dbbf24941ed283455882'],
];

export const normalizeValidData: [string, string][] = [
	['Öbb.at', 'öbb.at'],
	['Ⓜ', 'm'],
	['foo.zond', 'foo.zond'],
	['Foo.zond', 'foo.zond'],
	['🦚.zond', '🦚.zond'],
];
